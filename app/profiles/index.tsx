import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Avatar, FAB } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useActiveProfile } from '../../lib/profileContext';
import { theme } from '../../lib/theme';

const RELATIONSHIP_LABELS: Record<string, string> = {
  self: 'Self',
  child: 'Child',
  parent: 'Parent',
  pet: 'Pet',
  other: 'Other',
};

export default function ProfileList() {
  const router = useRouter();
  const { profiles } = useActiveProfile();

  return (
    <View style={styles.container}>
      <FlatList
        data={profiles}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card} mode="elevated" onPress={() => router.push(`/profiles/${item.id}`)}>
            <Card.Title
              title={item.name}
              subtitle={RELATIONSHIP_LABELS[item.relationship]}
              left={(props) => (
                <Avatar.Text
                  {...props}
                  label={item.name.slice(0, 1).toUpperCase()}
                  style={{ backgroundColor: item.color }}
                  color="#FFFFFF"
                />
              )}
            />
          </Card>
        )}
      />
      <FAB icon="plus" style={styles.fab} onPress={() => router.push('/profiles/new')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, flexGrow: 1 },
  card: { marginBottom: 12 },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: theme.colors.primary },
});
